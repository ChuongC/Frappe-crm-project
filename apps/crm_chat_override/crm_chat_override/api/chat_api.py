import frappe
import requests
import json
import os
from werkzeug.wrappers import Response as WerkzeugResponse


def _current_user():
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw("Authentication required", frappe.AuthenticationError)
    return user


def _rag_url():
    return (
        frappe.conf.get("rag_service_url")
        or os.environ.get("RAG_SERVICE_URL", "http://localhost:8001")
    )


# ── Streaming endpoint (called by @ai-sdk/vue useChat) ────────────────────────

@frappe.whitelist()
def chat_stream():
    """
    Streaming proxy for @ai-sdk/vue useChat.

    useChat sends:  POST { messages: [...], id: "conversation-id" }
    We forward to:  POST {rag_url}/api/chat  with the same body
    RAG returns:    plain text stream (streamProtocol: 'text')
    We forward:     the stream back to the browser

    Frappe returns a raw WerkzeugResponse → no JSON wrapping.
    """
    user = _current_user()

    # Read body — Frappe parses JSON body into form_dict
    messages        = frappe.form_dict.get("messages", [])
    conversation_id = frappe.request.headers.get("X-Conversation-Id", "")

    def generate():
        try:
            with requests.post(
                f"{_rag_url()}/api/chat",
                json={
                    "messages":        messages,
                    "conversation_id": conversation_id,
                    "user":            user,
                },
                stream=True,
                timeout=60,
            ) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        yield chunk

        except requests.ConnectionError:
            # RAG not running — stream a friendly message in plain text format
            msg = " The AI service is not running yet. Please start the RAG microservice on port 8001."
            yield msg.encode()

        except requests.Timeout:
            yield " The AI service timed out. Please try again.".encode()

        except Exception as exc:
            frappe.log_error(str(exc), "Chat AI – stream error")
            yield "Something went wrong. Please try again.".encode()

    return WerkzeugResponse(
        generate(),
        status=200,
        mimetype="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering so chunks arrive immediately
        },
        direct_passthrough=True,
    )


# ── Save message after streaming completes (called by onFinish in ChatView) ───

@frappe.whitelist()
def save_message(conversation_id, message, reply):
    """Called by ChatView.onFinish to persist the exchange after streaming ends."""
    user = _current_user()

    if not conversation_id:
        return {"success": False}

    owner = frappe.db.get_value("Chat AI Conversation", conversation_id, "user")
    if owner != user:
        frappe.throw("Not authorised", frappe.PermissionError)

    try:
        frappe.get_doc({
            "doctype":      "Chat AI Message",
            "user":         user,
            "conversation": conversation_id,
            "message":      (message or "").strip(),
            "reply":        (reply   or "").strip(),
        }).insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception as exc:
        frappe.db.rollback()
        frappe.log_error(str(exc), "Chat AI – save_message")

    return {"success": True}


# ── Conversation CRUD 

@frappe.whitelist()
def get_conversations():
    user = _current_user()
    rows = frappe.get_all(
        "Chat AI Conversation",
        filters={"user": user},
        fields=["name as id", "title as name", "creation as createdAt"],
        order_by="creation asc",
    )
    return {"conversations": rows}


@frappe.whitelist()
def create_conversation(name="New Conversation"):
    user = _current_user()
    doc = frappe.get_doc({
        "doctype": "Chat AI Conversation",
        "user":    user,
        "title":   (name or "New Conversation").strip(),
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"conversation": {"id": doc.name, "name": doc.title, "createdAt": str(doc.creation)}}


@frappe.whitelist()
def rename_conversation(conversation_id, name):
    user = _current_user()
    doc = frappe.get_doc("Chat AI Conversation", conversation_id)
    if doc.user != user:
        frappe.throw("Not authorised", frappe.PermissionError)
    doc.title = (name or "").strip()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"conversation": {"id": doc.name, "name": doc.title}}


@frappe.whitelist()
def delete_conversation(conversation_id):
    user = _current_user()
    owner = frappe.db.get_value("Chat AI Conversation", conversation_id, "user")
    if not owner:
        return {"success": True}
    if owner != user:
        frappe.throw("Not authorised", frappe.PermissionError)
    try:
        frappe.db.delete("Chat AI Message",      {"conversation": conversation_id})
        frappe.db.delete("Chat AI Conversation", {"name": conversation_id})
        frappe.db.commit()
    except Exception as exc:
        frappe.db.rollback()
        frappe.log_error(str(exc), "Chat AI – delete_conversation")
        frappe.throw("Could not delete conversation — please try again.")
    return {"success": True}


@frappe.whitelist()
def get_chat_history(conversation_id=""):
    user = _current_user()
    filters = {"user": user}
    if conversation_id:
        filters["conversation"] = conversation_id
    rows = frappe.get_all(
        "Chat AI Message",
        filters=filters,
        fields=["name", "message", "reply"],
        order_by="creation asc",
    )
    return {"message": rows}


# ── One-time bootstrap ────────────────────────────────────────────────────────

def setup_doctypes():
    if not frappe.db.exists("DocType", "Chat AI Conversation"):
        frappe.get_doc({
            "doctype": "DocType", "name": "Chat AI Conversation",
            "module": "Crm Chat Override", "custom": 1,
            "fields": [
                {"fieldname": "user",  "fieldtype": "Link", "options": "User", "label": "User",  "reqd": 1},
                {"fieldname": "title", "fieldtype": "Data",                    "label": "Title", "reqd": 1},
            ],
            "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}],
        }).insert(ignore_permissions=True)

    if not frappe.db.exists("DocType", "Chat AI Message"):
        frappe.get_doc({
            "doctype": "DocType", "name": "Chat AI Message",
            "module": "Crm Chat Override", "custom": 1,
            "fields": [
                {"fieldname": "user",         "fieldtype": "Link", "options": "User",                "label": "User",         "reqd": 1},
                {"fieldname": "conversation", "fieldtype": "Link", "options": "Chat AI Conversation", "label": "Conversation"},
                {"fieldname": "message",      "fieldtype": "Long Text",                               "label": "Message",      "reqd": 1},
                {"fieldname": "reply",        "fieldtype": "Long Text",                               "label": "Reply",        "reqd": 1},
            ],
            "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}],
        }).insert(ignore_permissions=True)

    frappe.db.commit()
    print("setup_doctypes complete.")