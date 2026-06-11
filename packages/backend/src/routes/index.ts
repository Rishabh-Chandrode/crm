import { Router } from 'express';
import authRouter from './auth.js';
import companiesRouter from './companies.js';
import prospectsRouter from './prospects.js';
import templatesRouter from './templates.js';
import emailRouter from './email.js';
import importRouter from './import.js';
import schedulesRouter from './schedules.js';
import settingsRouter from './settings.js';
import resumesRouter from './resumes.js';
import { authMiddleware } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

router.use('/auth', authRouter);

router.use('/companies',  authMiddleware, companiesRouter);
router.use('/prospects',  authMiddleware, prospectsRouter);
router.use('/templates',  authMiddleware, templatesRouter);
router.use('/email',      authMiddleware, emailRouter);
router.use('/import',     authMiddleware, importRouter);
router.use('/schedules',  authMiddleware, schedulesRouter);
router.use('/settings',   authMiddleware, settingsRouter);
router.use('/resumes',    authMiddleware, resumesRouter);

export default router;
