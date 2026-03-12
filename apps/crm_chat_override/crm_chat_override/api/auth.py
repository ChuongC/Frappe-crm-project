# crm_chat_override/api/auth.py
#
# Whitelisted Python methods called by the Vue stores via frappe.call().
# Place this file at:  apps/crm-chat-override/crm_chat_override/api/auth.py
#
# These are STUBS — replace the body of each function with your real logic
# (e.g. calls to your existing Node/Express backend, or native Frappe DocTypes).

import frappe


@frappe.whitelist()
def frappe_auth(email: str, name: str) -> dict:
    """
    Called once on ChatView mount.
    Creates or fetches the chat user record and returns the userId.

    Vue caller (stores/user.js):
        frappe.call({ method: 'crm_chat_override.api.auth.frappe_auth',
                      args: { email, name } })
    """
    # ── Option A: proxy to your existing Express /frappe-auth endpoint ────────
    # import requests
    # resp = requests.post("http://localhost:5000/frappe-auth",
    #                      json={"email": email, "name": name}, timeout=10)
    # data = resp.json()   # { userId, name, email, streamToken }
    # return data

    # ── Option B: use a Frappe DocType to store users (native approach) ───────
    # user_doc = frappe.db.get_value("Chat User", {"email": email}, ["name", "user_id"])
    # if not user_doc:
    #     doc = frappe.get_doc({"doctype": "Chat User", "email": email, "full_name": name})
    #     doc.insert(ignore_permissions=True)
    #     user_id = doc.name
    # else:
    #     user_id = user_doc.user_id
    # return {"userId": user_id, "name": name, "email": email}

    # ── Placeholder — replace with real logic ─────────────────────────────────
    return {
        "userId": email,   # use email as userId until real logic is added
        "name":   name,
        "email":  email,
    }