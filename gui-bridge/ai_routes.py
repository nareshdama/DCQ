"""FastAPI router for AI chat endpoints."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ai_providers import stream_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessagePayload(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    provider: str
    model: str
    apiKey: str
    baseUrl: str | None = None
    messages: list[ChatMessagePayload]
    currentCode: str = ""


@router.post("/chat")
async def chat(request: AIChatRequest):
    async def event_stream():
        try:
            user_messages = [
                {"role": m.role, "content": m.content} for m in request.messages
            ]
            async for chunk in stream_chat(
                provider=request.provider,
                user_messages=user_messages,
                current_code=request.currentCode,
                model=request.model,
                api_key=request.apiKey,
                base_url=request.baseUrl,
            ):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as exc:
            logger.exception("AI chat stream error")
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
