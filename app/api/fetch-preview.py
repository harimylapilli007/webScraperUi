from flask import Flask, request, jsonify
import requests
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

@app.route('/fetch-preview', methods=['POST'])
def fetch_preview():
    try:
        data = request.json
        url = data.get('url')
        
        if not url:
            return 'URL is required', 400
            
        # Fetch the webpage content
        response = requests.get(url)
        response.raise_for_status()
        
        # Return the HTML content
        return response.text
        
    except requests.RequestException as e:
        return str(e), 500
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(port=port) 