CREATE TABLE "brandbase"."pasted_links" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"reference" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brandbase"."pasted_links" ADD CONSTRAINT "pasted_links_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;