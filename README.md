# Anonymous File Drop 📁

A decentralized, anonymous file sharing service powered by the **x402 protocol**.
Upload a file, set a price (or make it free), and get a shareable link.
Buyers can pay in **ETH (Base Sepolia)** to unlock and download the file instantly.

## 🚀 Features

*   **Anonymous Uploads**: No accounts, no signups. Just drag & drop.
*   **Crypto Payments**: Built-in x402 payment gateway.
*   **Pay Walls**: Gate your files behind an ETH price tag.
*   **Direct Downloads**: Secure file delivery upon payment verification.
*   **Responsive UI**: Dark mode, mobile-friendly design.

## 🛠️ Stack

*   **Backend**: Python (Flask) + Web3.py
*   **Database**: SQLite (Ephemeral on Render Free Tier)
*   **Frontend**: Vanilla JS + CSS (Space Grotesk typography)
*   **Network**: Base Sepolia Testnet

## 📦 Deployment (Render)

This project is configured for deployment on [Render](https://render.com).

1.  Connect your GitHub repo.
2.  Set **Build Command**: `pip install -r requirements.txt`
3.  Set **Start Command**: `gunicorn main:app`
4.  Add Environment Variables:
    *   `PAYMENT_WALLET`: Your wallet address.
    *   `BASE_SEPOLIA_RPC`: Your RPC URL (e.g., Alchemy).

## 🤖 AI Agent Integration

Includes an autonomous **AI Buyer Agent** (`agent_buyer.py`) that can:
1.  Discover a file link.
2.  Check the price.
3.  Execute a blockchain transaction to pay.
4.  Download and verify the file content.
