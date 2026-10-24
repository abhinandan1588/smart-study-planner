/**
 * /api/v1/student/ai — the AI Study Assistant.
 *
 * The provider key lives only in the backend environment (AI_API_KEY) and is
 * never referenced here. The backend authenticates the caller, checks resource
 * permissions, retrieves document chunks and returns the answer with sources.
 */

import { cleanParams, del, get, patch, post, upload } from './api';

export const aiApi = {
  /** GET /student/ai/status → whether a provider is configured. */
  status: () => get('/student/ai/status'),

  listConversations: (params = {}) =>
    get('/student/ai/conversations', { params: cleanParams(params) }),
  createConversation: (payload = {}) => post('/student/ai/conversations', payload),
  getConversation: (id) => get(`/student/ai/conversations/${id}`),
  renameConversation: (id, title) => patch(`/student/ai/conversations/${id}`, { title }),
  deleteConversation: (id) => del(`/student/ai/conversations/${id}`),
  messages: (id, params = {}) =>
    get(`/student/ai/conversations/${id}/messages`, { params: cleanParams(params) }),

  /**
   * POST /student/ai/chat → { conversation_id, message:{role,content,sources}, disclaimer }
   * Returns 503 AI_UNAVAILABLE on provider failure rather than breaking the page.
   */
  chat: (payload) => post('/student/ai/chat', payload),

  quiz: (payload) => post('/student/ai/quiz', payload),
  flashcards: (payload) => post('/student/ai/flashcards', payload),

  /** POST /student/ai/retrieve — inspect which authorised chunks would be used. */
  retrieve: (payload) => post('/student/ai/retrieve', payload),

  listDocuments: (params = {}) =>
    get('/student/ai/documents', { params: cleanParams(params) }),
  uploadDocument: (file, fields = {}) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(cleanParams(fields)).forEach(([key, value]) =>
      form.append(key, value),
    );
    return upload('/student/ai/documents', form);
  },
  deleteDocument: (resourceId) => del(`/student/ai/documents/${resourceId}`),
};

export default aiApi;
