import os
import sys
import time
import threading
import socket
import logging
import uvicorn
import webview

# When bundled by PyInstaller, modules and data live under sys._MEIPASS.
# When running from source, they live next to this file.
_base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _base)
from main import app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gui_launcher")

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def run_server():
    logger.info("Starting backend uvicorn server thread...")
    # Serve static assets and API on port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

class Api:
    def save_file(self, filename, base64_data):
        import base64
        import traceback
        try:
            window = webview.windows[0]
            result = window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename=filename)
            if result:
                file_path = result[0]
                with open(file_path, 'wb') as f:
                    f.write(base64.b64decode(base64_data))
                return True
            return False
        except Exception as e:
            logger.error(f"Save file failed: {traceback.format_exc()}")
            return False

def main():
    # 1. Check if the server is already running on port 8000
    if is_port_open(8000):
        logger.info("FastAPI server is already active on port 8000. Reusing active server process...")
    else:
        # Start server in a daemon thread so it dies when the main process dies
        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()

        # 2. Wait until port 8000 is open (max 10 seconds)
        logger.info("Waiting for server to become responsive...")
        for _ in range(20):
            if is_port_open(8000):
                break
            time.sleep(0.5)
        else:
            logger.error("Server failed to start on port 8000!")
            sys.exit(1)

    logger.info("Server is up! Creating desktop window...")

    api = Api()

    # 3. Create a beautiful native window using pywebview
    webview.create_window(
        title="AI Accountant — الوحش المحاسبي",
        url="http://127.0.0.1:8000/",
        width=1280,
        height=800,
        min_size=(1024, 768),
        background_color="#0f172a",
        js_api=api
    )
    
    # 4. Start the native desktop GUI loop (blocks until window is closed)
    webview.start()
    logger.info("Desktop window closed. Exiting application.")

if __name__ == "__main__":
    main()
