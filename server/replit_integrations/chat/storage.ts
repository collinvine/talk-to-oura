import type { Conversation, Message, InsertConversation, InsertMessage } from "@shared/schema";

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

class MemoryChatStorage implements IChatStorage {
  private conversations: Map<number, Conversation> = new Map();
  private messages: Map<number, Message> = new Map();
  private nextConversationId = 1;
  private nextMessageId = 1;

  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createConversation(title: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.nextConversationId++,
      title,
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    this.conversations.delete(id);
    for (const [msgId, msg] of this.messages) {
      if (msg.conversationId === id) {
        this.messages.delete(msgId);
      }
    }
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((msg) => msg.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const message: Message = {
      id: this.nextMessageId++,
      conversationId,
      role,
      content,
      ouraData: null,
      createdAt: new Date(),
    };
    this.messages.set(message.id, message);
    return message;
  }
}

export const chatStorage: IChatStorage = new MemoryChatStorage();
