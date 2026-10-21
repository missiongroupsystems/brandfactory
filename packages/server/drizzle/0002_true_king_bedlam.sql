CREATE TABLE "brandbase"."brand_accounts" (
	"brand_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"username" text NOT NULL,
	"tokens" text NOT NULL,
	"connected_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_accounts_brand_id_platform_pk" PRIMARY KEY("brand_id","platform")
);
--> statement-breakpoint
ALTER TABLE "brandbase"."connections" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "brandbase"."brand_accounts" ADD CONSTRAINT "brand_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "brandbase"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brandbase"."brand_accounts" ADD CONSTRAINT "brand_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "brandbase"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_accounts_platform_account" ON "brandbase"."brand_accounts" USING btree ("platform","account_id");