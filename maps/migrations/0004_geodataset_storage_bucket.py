from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("maps", "0003_geodataset_image_video_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="geodataset",
            name="storage_bucket",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
