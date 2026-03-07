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
const prisma_1 = require("./utils/prisma");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Fetching students...');
            const students = yield prisma_1.prisma.student.findMany({
                take: 5,
                include: { class: true }
            });
            console.log('Successfully fetched students:', students.length);
            console.log(students);
        }
        catch (error) {
            console.error('Error fetching students:', error);
        }
        finally {
            yield prisma_1.prisma.$disconnect();
        }
    });
}
main();
