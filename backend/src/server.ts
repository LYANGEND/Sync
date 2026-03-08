import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { initScheduler } from './utils/scheduler';
import { processScheduledAnnouncements } from './controllers/communicationController';

const PORT = process.env.PORT || 3000;

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Attach io to app for use in controllers
(app as any).io = io;

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User joins their personal room
  socket.on('join_user', (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined personal room`);
  });

  // Join a conversation room
  socket.on('join_conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });

  // Leave a conversation room
  socket.on('leave_conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // Typing indicator
  socket.on('typing', (data: { conversationId: string; userId: string; fullName: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
      userId: data.userId,
      fullName: data.fullName,
    });
  });

  socket.on('stop_typing', (data: { conversationId: string; userId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      userId: data.userId,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Start background scheduler for automated debt collection
  initScheduler();

  // Process scheduled announcements every minute
  setInterval(processScheduledAnnouncements, 60 * 1000);
});
