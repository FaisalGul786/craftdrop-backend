import {Router} from "express"

import {register, sendEmailJob, verifyOTP} from "../controllers/auth.controller.js"

const router = Router()

router.post("/register", register)
router.post("/jobs/send-email", sendEmailJob)
router.post("/verify-otp", verifyOTP)

export default router