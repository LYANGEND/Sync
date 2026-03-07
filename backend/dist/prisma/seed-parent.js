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
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const email = 'peter.mwamba@email.com';
        const guardianName = 'Peter Mwamba';
        console.log(`🔍 Checking for parent user: ${email}`);
        // 1. Check if user exists
        let parentUser = yield prisma.user.findUnique({
            where: { email }
        });
        if (!parentUser) {
            const hashedPassword = yield bcryptjs_1.default.hash('parent123', 10);
            parentUser = yield prisma.user.create({
                data: {
                    email,
                    passwordHash: hashedPassword,
                    fullName: guardianName,
                    role: 'PARENT',
                }
            });
            console.log(`✅ Created parent user: ${email}`);
            console.log(`🔑 Credentials: ${email} / parent123`);
        }
        else {
            console.log(`ℹ️ Parent user already exists: ${email}`);
            console.log(`🔑 Credentials: ${email} / parent123`);
        }
        // 2. Link to Student
        console.log(`🔍 Linking to student with guardian email: ${email}`);
        const student = yield prisma.student.findFirst({
            where: { guardianEmail: email }
        });
        if (student) {
            yield prisma.student.update({
                where: { id: student.id },
                data: { parentId: parentUser.id }
            });
            console.log(`✅ Successfully linked parent ${email} to student: ${student.firstName} ${student.lastName} (Admission: ${student.admissionNumber})`);
        }
        else {
            console.log(`❌ No student found with guardian email ${email}`);
            // Try to find ANY student to link to for testing
            const anyStudent = yield prisma.student.findFirst();
            if (anyStudent) {
                console.log(`⚠️ Fallback: Linking to first available student: ${anyStudent.firstName}`);
                yield prisma.student.update({
                    where: { id: anyStudent.id },
                    data: { parentId: parentUser.id }
                });
            }
        }
    });
}
main()
    .catch(e => {
    console.error('❌ Error seeding parent:', e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
