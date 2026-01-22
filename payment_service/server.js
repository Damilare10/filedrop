
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // Load env from parent directory
import express from 'express';
import cors from 'cors';
import { Facilitator, createExpressAdapter } from 'x402-open';
import { baseSepolia } from 'viem/chains';

const app = express();
app.use(express.json());
app.use(cors());

// DEBUG LOGGING
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    if (req.method === 'POST') {
        console.log("Body:", JSON.stringify(req.body, null, 2));
    }
    next();
});

// Check for private key
if (!process.env.FACILITATOR_PRIVATE_KEY) {
    console.warn("⚠️  WARNING: FACILITATOR_PRIVATE_KEY not found in .env");
    console.warn("   Payment verification will fail without a signer.");
}

const facilitator = new Facilitator({
    // EVM support - Base Sepolia
    evmPrivateKey: process.env.FACILITATOR_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000", // Fallback for init only
    evmNetworks: [baseSepolia],
});

// Standard x402-open adapter
createExpressAdapter(facilitator, app, "/facilitator");

const PORT = 4101;
app.listen(PORT, () => {
    console.log(`✅ Payment Facilitator running on http://localhost:${PORT}`);
    console.log(`   - Supported: http://localhost:${PORT}/facilitator/supported`);
});
