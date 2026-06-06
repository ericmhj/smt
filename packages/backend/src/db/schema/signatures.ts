import { pgTable, uuid, varchar, timestamp, customType } from 'drizzle-orm/pg-core';
import { users } from './users.js';

const bytea = customType<{ data: Buffer; driverType: string }>({
  dataType() {
    return 'bytea';
  },
});

export const signatures = pgTable('signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: varchar('type', { length: 50 }).notNull(),
  encryptedImage: bytea('encrypted_image').notNull(),
  imageHash: varchar('image_hash', { length: 255 }).notNull(),
  hmac: varchar('hmac', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
