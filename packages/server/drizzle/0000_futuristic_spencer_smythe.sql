CREATE SCHEMA "brandbase";
--> statement-breakpoint
CREATE TABLE "brandbase"."brand_files" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"media_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."brand_kits" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"voice" jsonb NOT NULL,
	"colours" jsonb NOT NULL,
	"logo" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"line" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'Asia/Singapore' NOT NULL,
	"linked" text[] DEFAULT '{}'::text[] NOT NULL,
	"tiktok_defaults" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."comments" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"from_team" boolean DEFAULT false NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."connections" (
	"brand_id" text NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_brand_id_key_pk" PRIMARY KEY("brand_id","key")
);
--> statement-breakpoint
CREATE TABLE "brandbase"."crew" (
	"id" text PRIMARY KEY NOT NULL,
	"shoot_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"position" integer NOT NULL,
	"invited_at" timestamp with time zone,
	"reply" text
);
--> statement-breakpoint
CREATE TABLE "brandbase"."ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"format" text NOT NULL,
	"pillar" text DEFAULT '' NOT NULL,
	"hook" text NOT NULL,
	"angle" text DEFAULT '' NOT NULL,
	"feature" text DEFAULT '' NOT NULL,
	"image" text,
	"source" jsonb DEFAULT '{"own":true}'::jsonb NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"day" date,
	"why" text,
	"post_id" text,
	"inspiration" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cut" text,
	"sharper" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"built_on" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "brandbase"."inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"from_name" text NOT NULL,
	"from_handle" text NOT NULL,
	"text" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"tone" text NOT NULL,
	"post" jsonb,
	"earlier" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"replies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_to" text,
	"done_at" timestamp with time zone,
	"sent_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"reply_text" text,
	"reply_status" text,
	"replied_by" text
);
--> statement-breakpoint
CREATE TABLE "brandbase"."inbox_people" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."media" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"duration_s" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "brandbase"."members" (
	"user_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_user_id_brand_id_pk" PRIMARY KEY("user_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "brandbase"."post_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."post_sends" (
	"key" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."posts" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"format" text NOT NULL,
	"hook" text NOT NULL,
	"day" date,
	"time" text,
	"caption" text DEFAULT '' NOT NULL,
	"channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"from_idea" jsonb,
	"marked" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"who" text DEFAULT 'link' NOT NULL,
	"can" text DEFAULT 'comment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."shoots" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"title" text NOT NULL,
	"day" date NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"origin" text NOT NULL,
	"idea_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brandbase"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "brandbase"."voice_versions" (
	"brand_id" text NOT NULL,
	"n" integer NOT NULL,
	"by" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"voice" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_versions_brand_id_n_pk" PRIMARY KEY("brand_id","n")
);
--> statement-breakpoint
ALTER TABLE "brandbase"."brand_files" ADD CONSTRAINT "brand_files_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."brand_kits" ADD CONSTRAINT "brand_kits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."comments" ADD CONSTRAINT "comments_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."connections" ADD CONSTRAINT "connections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."crew" ADD CONSTRAINT "crew_shoot_id_shoots_id_fk" FOREIGN KEY ("shoot_id") REFERENCES "brandbase"."shoots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."ideas" ADD CONSTRAINT "ideas_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."ideas" ADD CONSTRAINT "ideas_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "brandbase"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."inbox_messages" ADD CONSTRAINT "inbox_messages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."inbox_people" ADD CONSTRAINT "inbox_people_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."media" ADD CONSTRAINT "media_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "brandbase"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."members" ADD CONSTRAINT "members_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."post_jobs" ADD CONSTRAINT "post_jobs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "brandbase"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."post_jobs" ADD CONSTRAINT "post_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."post_sends" ADD CONSTRAINT "post_sends_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "brandbase"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."posts" ADD CONSTRAINT "posts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."share_links" ADD CONSTRAINT "share_links_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."shoots" ADD CONSTRAINT "shoots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."voice_versions" ADD CONSTRAINT "voice_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_target" ON "brandbase"."comments" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "crew_shoot" ON "brandbase"."crew" USING btree ("shoot_id");--> statement-breakpoint
CREATE INDEX "ideas_brand" ON "brandbase"."ideas" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "inbox_brand" ON "brandbase"."inbox_messages" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_jobs_post_channel" ON "brandbase"."post_jobs" USING btree ("post_id","channel");--> statement-breakpoint
CREATE INDEX "post_jobs_due" ON "brandbase"."post_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "posts_brand_day" ON "brandbase"."posts" USING btree ("brand_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_target" ON "brandbase"."share_links" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "shoots_brand_day" ON "brandbase"."shoots" USING btree ("brand_id","day");