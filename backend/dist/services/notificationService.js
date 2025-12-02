"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastNotification = exports.createNotification = void 0;
const client_1 = require("@prisma/client");
const pushService_1 = require("./pushService");
const prisma = new client_1.PrismaClient();
const createNotification = (userId_1, title_1, message_1, ...args_1) => __awaiter(void 0, [userId_1, title_1, message_1, ...args_1], void 0, function* (userId, title, message, type = 'INFO') {
    try {
        const notification = yield prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type,
            },
        });
        // Send Push Notification
        const subscriptions = yield prisma.pushSubscription.findMany({
            where: { userId },
        });
        const payload = {
            title,
            body: message,
            icon: '/pwa-192x192.png',
            data: { url: '/notifications' }
        };
        subscriptions.forEach(sub => {
            (0, pushService_1.sendPushNotification)(sub, payload);
        });
        return notification;
    }
    catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
});
exports.createNotification = createNotification;
const broadcastNotification = (userIds_1, title_1, message_1, ...args_1) => __awaiter(void 0, [userIds_1, title_1, message_1, ...args_1], void 0, function* (userIds, title, message, type = 'INFO') {
    try {
        // Use createMany for bulk insertion
        yield prisma.notification.createMany({
            data: userIds.map(userId => ({
                userId,
                title,
                message,
                type,
            })),
        });
        // Send Push Notifications
        const subscriptions = yield prisma.pushSubscription.findMany({
            where: { userId: { in: userIds } },
        });
        const payload = {
            title,
            body: message,
            icon: '/pwa-192x192.png',
            data: { url: '/notifications' }
        };
        subscriptions.forEach(sub => {
            (0, pushService_1.sendPushNotification)(sub, payload);
        });
        return true;
    }
    catch (error) {
        console.error('Error broadcasting notification:', error);
        return false;
    }
});
exports.broadcastNotification = broadcastNotification;
