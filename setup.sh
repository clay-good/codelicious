#!/bin/bash

# Codelicious Setup Script
# This script sets up the development environment for Codelicious

set -e

echo "🍰 Codelicious Setup Script"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if Node.js is installed
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    print_info "Please install Node.js 18+ from https://nodejs.org/"
    print_info "Or use a package manager:"
    print_info "  macOS: brew install node"
    print_info "  Ubuntu: sudo apt install nodejs npm"
    exit 1
else
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION is installed"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
else
    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION is installed"
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_warning "Python 3 is not installed"
    print_info "Python is required for local embeddings"
    print_info "Install from https://www.python.org/ or use a package manager"
    SKIP_PYTHON=true
else
    PYTHON_VERSION=$(python3 --version)
    print_success "$PYTHON_VERSION is installed"
    SKIP_PYTHON=false
fi

echo ""
echo "Installing Node.js dependencies..."
npm install

if [ $? -eq 0 ]; then
    print_success "Node.js dependencies installed"
else
    print_error "Failed to install Node.js dependencies"
    exit 1
fi

# Install Python dependencies if Python is available
if [ "$SKIP_PYTHON" = false ]; then
    echo ""
    echo "Installing Python dependencies..."
    
    # Check if pip is installed
    if ! command -v pip3 &> /dev/null; then
        print_warning "pip3 is not installed"
        print_info "Skipping Python dependencies"
    else
        pip3 install -r requirements.txt
        
        if [ $? -eq 0 ]; then
            print_success "Python dependencies installed"
        else
            print_warning "Failed to install Python dependencies"
            print_info "You can install them later with: pip3 install -r requirements.txt"
        fi
    fi
fi

echo ""
echo "Building the extension..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Extension built successfully"
else
    print_error "Failed to build extension"
    exit 1
fi

echo ""
echo "============================"
print_success "Setup completed successfully!"
echo ""
echo "Next steps:"
echo "  1. Open this folder in VS Code"
echo "  2. Press F5 to run the extension in development mode"
echo "  3. Or run 'code --install-extension ./dist/codelicious-0.1.0.vsix' to install"
echo ""
echo "Optional: Start the embedding server"
echo "  cd server && ./start_server.sh"
echo ""
echo "For more information, see README.md"

