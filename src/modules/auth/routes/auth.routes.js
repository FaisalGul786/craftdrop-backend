import {Router} from "express"

import {register, sendEmailJob, verifyOTP, loginUser, forgotPassword, resetPassword, verifyResetOTP, sendResetEmailJob} from "../controllers/auth.controller.js"

const router = Router()

router.post("/register", register)
router.post("/jobs/send-email", sendEmailJob)
router.post("/verify-otp", verifyOTP)
router.post("/login", loginUser)

router.post("/forgot-password", forgotPassword)
router.post("/verify-reset-otp", verifyResetOTP)
router.post("/reset-password", resetPassword)
router.post("/jobs/send-reset-email", sendResetEmailJob)

export default router