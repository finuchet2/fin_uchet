"""Make user categories independent for each project.

Revision ID: c82f4a91d6e3
Revises: b71c2d8e4f90
"""
from alembic import op
import sqlalchemy as sa

revision = "c82f4a91d6e3"
down_revision = "b71c2d8e4f90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_index("ix_categories_project_id", "categories", ["project_id"])
    op.create_foreign_key(
        "fk_categories_project_id_business_projects",
        "categories", "business_projects", ["project_id"], ["id"], ondelete="CASCADE",
    )
    # Remove the old global-per-user uniqueness before copying categories to
    # several projects; the replacement indexes are created after the copy.
    op.drop_index("uq_categories_user_lower_name_type", table_name="categories")

    # Previously user categories were shared across all projects. Copy them to
    # each existing project and move each transaction to its project's copy.
    op.execute(sa.text("""
        DO $$
        DECLARE
            old_category RECORD;
            project_row RECORD;
            new_category_id INTEGER;
        BEGIN
            FOR old_category IN
                SELECT id, user_id, name, type, is_system, is_active
                FROM categories
                WHERE user_id IS NOT NULL AND project_id IS NULL
                ORDER BY id
            LOOP
                IF EXISTS (SELECT 1 FROM business_projects WHERE user_id = old_category.user_id) THEN
                    FOR project_row IN
                        SELECT id FROM business_projects WHERE user_id = old_category.user_id ORDER BY id
                    LOOP
                        INSERT INTO categories (user_id, project_id, name, type, is_system, is_active)
                        VALUES (old_category.user_id, project_row.id, old_category.name,
                                old_category.type, FALSE, old_category.is_active)
                        RETURNING id INTO new_category_id;

                        UPDATE transactions
                        SET category_id = new_category_id
                        WHERE project_id = project_row.id AND category_id = old_category.id;
                    END LOOP;
                    DELETE FROM categories WHERE id = old_category.id;
                END IF;
            END LOOP;
        END $$;
    """))

    op.create_index(
        "uq_categories_user_project_lower_name_type", "categories",
        ["user_id", "project_id", sa.text("lower(name)"), "type"], unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL AND project_id IS NOT NULL"),
    )
    op.create_index(
        "uq_categories_user_global_lower_name_type", "categories",
        ["user_id", sa.text("lower(name)"), "type"], unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL AND project_id IS NULL"),
    )


def downgrade() -> None:
    # Preserve the current category data while returning to the former shared
    # category model. Project-specific rows are merged by user/name/type.
    op.execute(sa.text("""
        DO $$
        DECLARE
            category_row RECORD;
            global_id INTEGER;
        BEGIN
            FOR category_row IN
                SELECT * FROM categories WHERE project_id IS NOT NULL ORDER BY id
            LOOP
                SELECT id INTO global_id FROM categories
                WHERE user_id = category_row.user_id AND project_id IS NULL
                  AND type = category_row.type AND lower(name) = lower(category_row.name)
                LIMIT 1;
                IF global_id IS NULL THEN
                    UPDATE categories SET project_id = NULL WHERE id = category_row.id;
                ELSE
                    UPDATE transactions SET category_id = global_id
                    WHERE category_id = category_row.id AND type = category_row.type;
                    DELETE FROM categories WHERE id = category_row.id;
                END IF;
                global_id := NULL;
            END LOOP;
        END $$;
    """))
    op.drop_index("uq_categories_user_project_lower_name_type", table_name="categories")
    op.drop_index("uq_categories_user_global_lower_name_type", table_name="categories")
    op.create_index(
        "uq_categories_user_lower_name_type", "categories",
        ["user_id", sa.text("lower(name)"), "type"], unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.drop_constraint("fk_categories_project_id_business_projects", "categories", type_="foreignkey")
    op.drop_index("ix_categories_project_id", table_name="categories")
    op.drop_column("categories", "project_id")
