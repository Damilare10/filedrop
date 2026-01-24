# main.py - Anonymous File Drop Service with x402 Payment Gateway
import os
import sqlite3
import uuid
import time
import mimetypes
from flask import Flask, request, jsonify, send_file, abort
from flask_cors import CORS
from web3 import Web3
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
  # Allow cross-origin requests

# Configuration
RECEIVER_WALLET = os.getenv("PAYMENT_WALLET")
RPC_URL = os.getenv("BASE_SEPOLIA_RPC")
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
DB_PATH = os.path.join(os.path.dirname(__file__), "files.db")

# Ensure required env vars
if not RECEIVER_WALLET:
    raise ValueError("PAYMENT_WALLET not found in .env")
if not RPC_URL:
    raise ValueError("BASE_SEPOLIA_RPC not found in .env")

# Ensure storage directory exists
if not os.path.exists(STORAGE_DIR):
    os.makedirs(STORAGE_DIR)

# Web3 Setup
web3 = Web3(Web3.HTTPProvider(RPC_URL))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                price_eth REAL NOT NULL,
                storage_key TEXT NOT NULL,
                mime_type TEXT,
                size_bytes INTEGER,
                created_at REAL NOT NULL
            )
        """)
        # Migration for existing DBs (idempotent)
        try:
            conn.execute("ALTER TABLE files ADD COLUMN size_bytes INTEGER")
        except sqlite3.OperationalError:
            pass # Column likely exists
        conn.commit()

# Initialize DB
# init_db() # Moved to if __name__ == "__main__": block

def verify_payment(tx_hash: str, payer: str, required_eth: float) -> bool:
    """Verifies a payment on Base Sepolia."""
    try:
        print(f"Verifying Tx: {tx_hash} | Payer: {payer} | Required: {required_eth} ETH")
        
        # 1. Get receipt
        receipt = web3.eth.get_transaction_receipt(tx_hash)
        if not receipt:
            print("Tx not found or pending.")
            return False
            
        if receipt['status'] != 1:
            print("Tx failed (status 0).")
            return False

        # 2. Get tx details
        tx = web3.eth.get_transaction(tx_hash)
        
        # 3. Verify Receiver
        if tx['to'].lower() != RECEIVER_WALLET.lower():
            print(f"Wrong receiver: {tx['to']}")
            return False
            
        # 4. Verify Sender
        if tx['from'].lower() != payer.lower():
            print(f"Wrong sender: {tx['from']}")
            return False
            
        # 5. Verify Amount (Allowing for small float diffs, so compare wei)
        required_wei = Web3.to_wei(required_eth, 'ether')
        # Allow 1% slippage/rounding error just in case, though usually exact
        if tx['value'] < required_wei: 
            print(f"Value too low: {tx['value']} < {required_wei}")
            return False
            
        print(f"✅ Payment Verified: {tx_hash}")
        return True

    except Exception as e:
        print(f"Verification error: {e}")
        return False

@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Upload a file and set a price."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
        
    file = request.files['file']
    price = request.form.get('price')
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if not price:
        return jsonify({"error": "Price is required"}), 400
        
    try:
        price_eth = float(price)
        if price_eth < 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Invalid price"}), 400

    file_id = str(uuid.uuid4())
    storage_key = f"{file_id}_{file.filename}"
    save_path = os.path.join(STORAGE_DIR, storage_key)
    
    file.save(save_path)
    
    # MIME type detection
    mime_type = mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'

    file_size = os.path.getsize(save_path)

    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO files (id, filename, price_eth, storage_key, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_id, file.filename, price_eth, storage_key, mime_type, file_size, time.time())
        )
        conn.commit()
        
    return jsonify({
        "status": "ok",
        "file_id": file_id, 
        "link": f"{request.host_url}?id={file_id}"
    })

@app.route("/api/file/<file_id>/info", methods=["GET"])
def get_file_info(file_id):
    """Get public metadata for a file."""
    with get_db_connection() as conn:
        file_row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        
    if not file_row:
        return jsonify({"error": "File not found"}), 404
        
    return jsonify({
        "filename": file_row["filename"],
        "price_eth": file_row["price_eth"],
        "mime_type": file_row["mime_type"],
        "size_bytes": file_row["size_bytes"],
        "created_at": file_row["created_at"],
        "receiver_wallet": RECEIVER_WALLET
    })

@app.route("/api/file/<file_id>/unlock", methods=["POST"])
def unlock_file(file_id):
    """Unlock and stream the file if payment is verified."""
    data = request.get_json(silent=True) or {}
    tx_hash = data.get("payment_tx")
    payer = data.get("payer")
    
    if not tx_hash or not payer:
        return jsonify({"error": "Payment info required (tx hash, payer)"}), 400
    
    with get_db_connection() as conn:
        file_row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        
    if not file_row:
        return jsonify({"error": "File not found"}), 404
        
    # Free download?
    if file_row["price_eth"] <= 0:
         # Skip payment check
         pass
    else:
        # Verify Payment
        if not verify_payment(tx_hash, payer, file_row["price_eth"]):
            return jsonify({"error": "Payment verification failed"}), 402
            
    # Serve File
    file_path = os.path.join(STORAGE_DIR, file_row["storage_key"])
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on server"}), 500
        
    return send_file(
        file_path, 
        as_attachment=True, 
        download_name=file_row["filename"],
        mimetype=file_row["mime_type"]
    )

@app.route("/")
def index():
    return send_file("index.html")

if __name__ == "__main__":
    init_db()
    # For local dev
    app.run(host="0.0.0.0", port=5000, debug=True)
