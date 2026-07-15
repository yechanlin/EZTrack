from django.db import migrations

# Global categories, available to every user. user=NULL marks them as defaults.
DEFAULTS = ["Food", "Shopping", "Subscription"]


def seed(apps, schema_editor):
    # Use the historical model, not a direct import. If Category gains a field in a
    # later migration, a direct import would suddenly reference a column that
    # doesn't exist yet at this point in the migration history.
    Category = apps.get_model("expenses", "Category")
    for name in DEFAULTS:
        Category.objects.get_or_create(name=name, user=None)


def unseed(apps, schema_editor):
    Category = apps.get_model("expenses", "Category")
    # Only remove the ones still unused — Expense.category is PROTECT, so deleting
    # a category someone has spent against would raise.
    Category.objects.filter(name__in=DEFAULTS, user=None, expenses__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("expenses", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
