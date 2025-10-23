#!/bin/bash

# Start the Codelicious Embedding Server

echo "Starting Codelicious Embedding Server..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r ../requirements.txt

# Start the server
echo "Starting server on http://localhost:8765"
python embedding_server.py

