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
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Testing DB Connection...');
        try {
            const count = yield prisma.user.count();
            console.log(`User Count: ${count}`);
            console.log('Testing Classes...');
            const classes = yield prisma.class.findMany({ take: 1 });
            console.log('Classes fetch success:', classes);
            console.log('Testing Subjects...');
            const subjects = yield prisma.subject.findMany({ take: 1 });
            console.log('Subjects fetch success:', subjects);
            console.log('Testing Payments...');
            const payments = yield prisma.payment.findMany({ take: 1 });
            console.log('Payments fetch success:', payments);
        }
        catch (e) {
            console.error('ERROR OCCURRED:');
            console.error(e);
        }
        finally {
            yield prisma.$disconnect();
        }
    });
}
main();
