import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app';
import { initScheduler } from './utils/scheduler';
import { processScheduledAnnouncements } from './controllers/communicationController';
import { initClassroomAutomationScheduler } from './services/classroomAutomationService';
import { setClassroomSocketServer } from './services/classroomRealtimeService';
import { initDomainVerificationScheduler } from './services/domainVerificationService';
import { forEachActiveTenant } from './utils/tenantJobRunner';
import { prisma, systemPrisma } from './utils/prisma';
import { runWithTenant } from './middleware/tenantContext';
import { initializeQueueRuntime, shutdownQueueRuntime } from './queues/queueRuntime';
import { getTenantFileUrlTtlSeconds } from './services/tenantFileService';
import {
  initializeApiRateLimitRuntime,
  shutdownApiRateLimitRuntime,
} from './middleware/rateLimiter';
import {
  initializeFinancialSnapshotCacheRuntime,
  shutdownFinancialSnapshotCacheRuntime,
} from './cache/financialSnapshotCache';
import {
  initializeSmsRateLimitRuntime,
  shutdownSmsRateLimitRuntime,
} from './services/smsRateLimitService';

const PORT = process.env.PORT || 3000;

// Create HTTP server and attach Socket.io
const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const socketJwtSecret = process.env.JWT_SECRET;
if (!socketJwtSecret) throw new Error('FATAL: JWT_SECRET environment variable is not set');

io.use(async (socket, next) => {
  try {
    const authorization = String(socket.handshake.headers.authorization || '');
    const token = String(socket.handshake.auth?.token || authorization.replace(/^Bearer\s+/i, ''));
    if (!token) return next(new Error('Authentication required'));

    const claims = jwt.verify(token, socketJwtSecret) as {
      userId?: string;
      tenantId?: string;
      role?: string;
    };
    if (!claims.userId || !claims.tenantId || !claims.role) {
      return next(new Error('Invalid tenant identity'));
    }

    const [tenant, user] = await Promise.all([
      systemPrisma.tenant.findUnique({ where: { id: claims.tenantId }, select: { status: true } }),
      systemPrisma.user.findFirst({
        where: { id: claims.userId, tenantId: claims.tenantId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!tenant || tenant.status !== 'ACTIVE' || !user) {
      return next(new Error('Tenant or user unavailable'));
    }

    socket.data.user = claims;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// Attach io to app for use in controllers
(app as any).io = io;
setClassroomSocketServer(io);

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  const identity = socket.data.user as { userId: string; tenantId: string; role: string };
  const joinedConversations = new Set<string>();

  // User joins their personal room
  socket.on('join_user', (userId: string) => {
    if (userId !== identity.userId) return;
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined personal room`);
  });

  // Join a conversation room
  socket.on('join_conversation', async (conversationId: string) => {
    const membership = await runWithTenant(identity.tenantId, () => prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: identity.userId },
      select: { id: true },
    }));
    if (!membership) return;
    joinedConversations.add(conversationId);
    await socket.join(`conversation:${conversationId}`);
  });

  // Leave a conversation room
  socket.on('leave_conversation', (conversationId: string) => {
    joinedConversations.delete(conversationId);
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on('join_classroom', async (classroomId: string) => {
    const classroom = await runWithTenant(identity.tenantId, () => prisma.virtualClassroom.findFirst({
      where: { id: classroomId },
      select: { id: true },
    }));
    if (!classroom) return;
    await socket.join(`classroom:${classroomId}`);
  });

  socket.on('leave_classroom', (classroomId: string) => {
    socket.leave(`classroom:${classroomId}`);
  });

  // Typing indicator
  socket.on('typing', (data: { conversationId: string; userId: string; fullName: string }) => {
    if (data.userId !== identity.userId || !joinedConversations.has(data.conversationId)) return;
    socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
      userId: data.userId,
      fullName: data.fullName,
    });
  });

  socket.on('stop_typing', (data: { conversationId: string; userId: string }) => {
    if (data.userId !== identity.userId || !joinedConversations.has(data.conversationId)) return;
    socket.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      userId: data.userId,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const startServer = async (): Promise<void> => {
  const fileUrlTtlSeconds = getTenantFileUrlTtlSeconds();
  console.log(`[Files] Signed URL lifetime: ${fileUrlTtlSeconds}s`);
  const rateLimitStatus = await initializeApiRateLimitRuntime();
  console.log(`[RateLimit] Runtime state: ${rateLimitStatus.state}`);
  const snapshotCacheStatus = await initializeFinancialSnapshotCacheRuntime();
  console.log(`[FinancialSnapshotCache] Runtime state: ${snapshotCacheStatus.state}`);
  const smsRateLimitStatus = await initializeSmsRateLimitRuntime();
  console.log(`[SmsRateLimit] Runtime state: ${smsRateLimitStatus.state}`);
  const queueStatus = await initializeQueueRuntime();
  console.log(`[Queue] Runtime state: ${queueStatus.state}`);

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Start background scheduler for automated debt collection
    initScheduler();
    initClassroomAutomationScheduler();
    initDomainVerificationScheduler();

    // Process scheduled announcements every minute
    setInterval(() => {
      forEachActiveTenant('ScheduledAnnouncements', async () => processScheduledAnnouncements(), 55 * 1000)
        .catch((error) => console.error('[ScheduledAnnouncements] Cycle failed:', error));
    }, 60 * 1000);
  });
};

let isShuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] ${signal} received; shutting down`);

  if (server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  await Promise.allSettled([
    shutdownApiRateLimitRuntime(),
    shutdownFinancialSnapshotCacheRuntime(),
    shutdownSmsRateLimitRuntime(),
    shutdownQueueRuntime(),
  ]);
  await Promise.allSettled([
    prisma.$disconnect(),
    systemPrisma.$disconnect(),
  ]);
};

process.once('SIGTERM', () => {
  shutdown('SIGTERM')
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Server] Shutdown failed:', error);
      process.exit(1);
    });
});

process.once('SIGINT', () => {
  shutdown('SIGINT')
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Server] Shutdown failed:', error);
      process.exit(1);
    });
});

startServer().catch((error) => {
  console.error('[Server] Startup failed:', error);
  process.exitCode = 1;
});
