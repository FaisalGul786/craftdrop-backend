import express from "express"

import {errorHandler} from "./shared/middleware/global.handler.js"
import {authRoutes} from "./modules/auth/index.js"

const app = express()
app.use(express.json())


app.get("/check", (req,res) => {
  res.status(200).json({"message": "Working 🙌🏽"});
});

/*  ~~~~ Auth Api Endpoints ~~~~  */
app.use("/auth", authRoutes)



/* ~~~~ Global Error Handler Middleware ~~~~ */
app.use(errorHandler)

export default app