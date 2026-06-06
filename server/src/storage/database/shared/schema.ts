import { pgTable, serial, timestamp, varchar, text, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 历史记录表（用于云端同步）
export const historyRecords = pgTable(
	"history_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 64 }).notNull(), // 设备/用户标识
		input_text: text("input_text").notNull(), // 用户输入的原始内容
		polished_text: text("polished_text").notNull(), // 润色后的内容
		images: jsonb("images").default([]).notNull(), // 图片URL数组
		style: varchar("style", { length: 20 }).notNull().default("professional"), // 风格
		supplement: text("supplement"), // 补充说明
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("history_user_id_idx").on(table.user_id), // 按用户ID查询
		index("history_created_at_idx").on(table.created_at), // 按时间排序
	]
);
