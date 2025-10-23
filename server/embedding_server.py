"""
Local Embedding Server for Codelicious
Provides REST API for generating embeddings using Sentence-Transformers
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from sentence_transformers import SentenceTransformer
import numpy as np
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Codelicious Embedding Server", version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
model: Optional[SentenceTransformer] = None
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


class EmbeddingRequest(BaseModel):
    """Request model for embedding generation"""
    texts: List[str]
    batch_size: int = 32


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation"""
    embeddings: List[List[float]]
    model: str
    dimension: int


@app.on_event("startup")
async def startup_event():
    """Load the model on startup"""
    global model
    try:
        logger.info(f"Loading model: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        logger.info("Model loaded successfully!")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "model": MODEL_NAME,
        "version": "0.1.0"
    }


@app.get("/health")
async def health():
    """Detailed health check"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "dimension": model.get_sentence_embedding_dimension()
    }


@app.post("/embed", response_model=EmbeddingResponse)
async def generate_embeddings(request: EmbeddingRequest):
    """Generate embeddings for the provided texts"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not request.texts:
        raise HTTPException(status_code=400, detail="No texts provided")
    
    try:
        logger.info(f"Generating embeddings for {len(request.texts)} texts")
        
        # Generate embeddings
        embeddings = model.encode(
            request.texts,
            batch_size=request.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        
        # Convert to list format
        embeddings_list = embeddings.tolist()
        
        return EmbeddingResponse(
            embeddings=embeddings_list,
            model=MODEL_NAME,
            dimension=model.get_sentence_embedding_dimension()
        )
    
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/single")
async def generate_single_embedding(text: str):
    """Generate embedding for a single text"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    try:
        embedding = model.encode([text], show_progress_bar=False)[0]
        
        return {
            "embedding": embedding.tolist(),
            "model": MODEL_NAME,
            "dimension": len(embedding)
        }
    
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def main():
    """Run the server"""
    logger.info("Starting Codelicious Embedding Server...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info"
    )


if __name__ == "__main__":
    main()

