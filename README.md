crm_chat_override
AI chat assistant embedded into Frappe CRM. Adds a floating popup + full-page chat, streamed from your RAG microservice, persisted in Frappe DB.

Quick Start
bash# 1. Install
./env/bin/pip install -e apps/crm_chat_override --no-deps
bench --site crm.localhost install-app crm_chat_override
bench --site crm.localhost migrate
bench --site crm.localhost execute crm_chat_override.api.chat_api.setup_doctypes

# 2. Point to RAG service — add to site_config.json
{ "rag_service_url": "http://localhost:8001" }

# 3. Build
cd apps/crm_chat_override/frontend && yarn && yarn build
bench build --app crm_chat_override
bench --site crm.localhost clear-cache && bench restart
After any Python change: bench --site crm.localhost clear-cache && bench restart
After any frontend change: yarn build && bench build --app crm_chat_override && bench --site crm.localhost clear-cache && bench restart
