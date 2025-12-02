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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const web_push_1 = __importDefault(require("web-push"));
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';
if (!publicVapidKey || !privateVapidKey) {
    console.warn('VAPID keys not found. Push notifications will not work.');
}
else {
    web_push_1.default.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);
}
const sendPushNotification = (subscription, payload) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield web_push_1.default.sendNotification(subscription, JSON.stringify(payload));
        return true;
    }
    catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
});
exports.sendPushNotification = sendPushNotification;
exports.default = web_push_1.default;
