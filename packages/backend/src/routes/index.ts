import { Router } from 'express';
import authRouter from './auth.js';
import gmailOAuthRouter from './gmailOAuth.js';
import googleLoginRouter from './googleLogin.js';
import usersRouter from './users.js';
import companiesRouter from './companies.js';
import prospectsRouter from './prospects.js';
import templatesRouter from './templates.js';
import emailRouter from './email.js';
import importRouter from './import.js';
import schedulesRouter from './schedules.js';
import settingsRouter from './settings.js';
import documentsRouter from './documents.js';
import trackRouter from './track.js';
import variablePresetsRouter from './variable-presets.js';
import statsRouter from './stats.js';
import { authMiddleware } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

router.use('/auth', authRouter);
router.use('/auth/gmail', gmailOAuthRouter);
router.use('/auth/google', googleLoginRouter);
router.use('/users', usersRouter);
router.use('/track', trackRouter); // public — email clients don't send auth headers

router.use('/companies',  authMiddleware, companiesRouter);
router.use('/prospects',  authMiddleware, prospectsRouter);
router.use('/templates',  authMiddleware, templatesRouter);
router.use('/email',      authMiddleware, emailRouter);
router.use('/import',     authMiddleware, importRouter);
router.use('/schedules',  authMiddleware, schedulesRouter);
router.use('/settings',   authMiddleware, settingsRouter);
router.use('/documents',         authMiddleware, documentsRouter);
router.use('/variable-presets',  authMiddleware, variablePresetsRouter);
router.use('/stats',             authMiddleware, statsRouter);

export default router;
