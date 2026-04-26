import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1777186327206 implements MigrationInterface {
    name = 'InitialSchema1777186327206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "couriers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "full_name" character varying NOT NULL, "vehicle_type" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_dbb79407286509e8c44ea60d9d2" UNIQUE ("email"), CONSTRAINT "PK_141c3ed6f70beb9ddf4ab4a0e86" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "pickup_address" character varying NOT NULL, "dropoff_address" character varying NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "courier_id" uuid, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "full_name" character varying NOT NULL, "phone_number" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_0e0e0b6db50dc05c12031bce4c3" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_0e0e0b6db50dc05c12031bce4c3"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`DROP TABLE "couriers"`);
    }

}
