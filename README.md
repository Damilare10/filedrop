# Pay-Per-Pixel Canvas (x402)

A clean, decentralized pixel art canvas running on **Base Sepolia**. Users can drag-and-paint pixels and pay for them in batches using the x402 protocol.

## 🚀 Features

*   **Drag & Paint**: Smooth 60fps drawing experience with touch support.
*   **Batch Payments**: Paint 100 pixels, pay 1 transaction.
*   **x402 Protocol**: Uses HTTP 402 status codes to trigger crypto payments.
*   **Wallet Integration**: Auto-detects MetaMask/Coinbase Wallet.
*   **Instant UX**: Client-side price calculation for instant wallet popups.
*   **Mobile Ready**: Works on mobile browsers within the local network.
*   **Tech Stack**: Python (Flask) Backend + Vanilla JS Frontend.

## 🛠️ Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Configuration**:
    Create a `.env` file:
    ```env
    PAYMENT_WALLET=0xYourWalletAddress
    BASE_SEPOLIA_RPC=https://...
    ```

3.  **Start Backend**:
    ```bash
    python main.py
    ```
    *Runs on http://127.0.0.1:5000*

4.  **Start Frontend**:
    ```bash
    python -m http.server 8000
    ```
    *Runs on http://localhost:8000*

## 📱 Mobile Access

Find your PC's local IP (e.g., `10.0.0.5`) and visit:
`http://10.0.0.5:8000`

## 🎨 How to Use

1.  Select a color.
2.  Drag across the canvas to paint.
3.  Click **"Pay & Save"**.
4.  Confirm the transaction in your wallet.
5.  Wait for the "Success" notification!
