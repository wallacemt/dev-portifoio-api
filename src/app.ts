import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requestLogger } from "./middleware/requestLogger";
import { routes } from "./routes";
dotenv.config();
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(requestLogger);
app.use(express.json());
routes(app);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
