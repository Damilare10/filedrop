# agent_buyer.py - An AI Agent that buys files autonomously
# Usage: python agent_buyer.py <file_url_or_id>

import os
import sys
import requests
import time
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# --- Config ---
# For the hackathon demo, we can hardcode a secondary wallet private key here 
# OR load it from .env as BUYER_PRIVATE_KEY.
# DO NOT use the same wallet as the seller (or payment will fail "self-transfer" check if logic is strict, 
# though usually it just wastes gas).
BUYER_PRIVATE_KEY = os.getenv("BUYER_PRIVATE_KEY")
RPC_URL = os.getenv("BASE_SEPOLIA_RPC", "https://sepolia.base.org")

if not BUYER_PRIVATE_KEY:
    print("❌ Error: BUYER_PRIVATE_KEY not found in .env")
    print("Please add a private key for the buyer agent to your .env file.")
    sys.exit(1)

# Setup Web3
web3 = Web3(Web3.HTTPProvider(RPC_URL))
account = web3.eth.account.from_key(BUYER_PRIVATE_KEY)
buyer_address = account.address

print(f"🤖 AI Agent Initialized")
print(f"   Wallet: {buyer_address}")
print(f"   Balance: {web3.from_wei(web3.eth.get_balance(buyer_address), 'ether'):.6f} ETH")
print("-" * 40)

def buy_file(file_id_or_url):
    # 1. Parse ID
    if "http" in file_id_or_url:
        # extract id param if url
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(file_id_or_url)
        file_id = parse_qs(parsed.query).get('id', [None])[0]
    else:
        file_id = file_id_or_url

    if not file_id:
        print("❌ Invalid file ID or URL")
        return

    base_url = "http://localhost:5000" # Assuming local dev
    print(f"🔎 Inspecting file: {file_id}")

    # 2. Get File Info (The "Discovery" Phase)
    try:
        resp = requests.get(f"{base_url}/api/file/{file_id}/info")
        if resp.status_code == 404:
            print("❌ File not found.")
            return
        info = resp.json()
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return

    price_eth = info.get('price_eth', 0)
    filename = info.get('filename', 'downloaded_file')
    receiver = info.get('receiver_wallet')

    print(f"   File: {filename}")
    print(f"   Price: {price_eth} ETH")
    print(f"   Seller: {receiver}")

    # 3. Make Payment (The "Action" Phase)
    if price_eth > 0:
        print(f"💸 Initiating payment of {price_eth} ETH...")
        
        # Build Tx
        tx = {
            'to': receiver,
            'value': web3.to_wei(price_eth, 'ether'),
            'gas': 21000,
            'gasPrice': web3.eth.gas_price,
            'nonce': web3.eth.get_transaction_count(buyer_address),
            'chainId': 84532 # Base Sepolia
        }

        # Sign
        signed_tx = web3.eth.account.sign_transaction(tx, BUYER_PRIVATE_KEY)
        
        # Send
        try:
            tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
            tx_hex = web3.to_hex(tx_hash)
            print(f"   ✅ Payment Sent! Hash: {tx_hex}")
            
            # Wait for receipt
            print("   ⏳ Waiting for confirmation...")
            receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
            if receipt.status != 1:
                print("❌ Transaction failed on-chain.")
                return
            print("   ✅ Transaction Confirmed.")
            
        except Exception as e:
            print(f"❌ Payment failed: {e}")
            return
    else:
        print("🆓 File is free. Skipping payment.")
        tx_hex = "free"

    # 4. Download (The "Consumption" Phase)
    print("📥 Downloading file...")
    try:
        unlock_resp = requests.post(
            f"{base_url}/api/file/{file_id}/unlock",
            json={"payment_tx": tx_hex, "payer": buyer_address}
        )
        
        if unlock_resp.status_code == 200:
            output_filename = f"agent_download_{filename}"
            with open(output_filename, 'wb') as f:
                f.write(unlock_resp.content)
            print(f"🎉 SUCCESSS: File saved as '{output_filename}'")
        else:
            print(f"❌ Access Denied: {unlock_resp.text}")
            
    except Exception as e:
        print(f"❌ Download failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent_buyer.py <file_link_or_id>")
    else:
        buy_file(sys.argv[1])
