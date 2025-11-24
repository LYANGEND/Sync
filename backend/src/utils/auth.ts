import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export const generateToken = (userId: string, role: string, schoolId: string) => {
  return jwt.sign({ userId, role, schoolId }, JWT_SECRET, { expiresIn: '24h' });
};

export const hashPassword = async (password: string) => {
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, hash: string) => {
  return await bcrypt.compare(password, hash);
};
