import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv'

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/auth', (req, res) => {
    res.json({message: "Bem vindo(a)!"});
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
})