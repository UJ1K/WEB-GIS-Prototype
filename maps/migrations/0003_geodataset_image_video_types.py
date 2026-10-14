from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("maps", "0002_geodataset_mapfeature_dataset"),
    ]

    operations = [
        migrations.AlterField(
            model_name="geodataset",
            name="data_type",
            field=models.CharField(
                choices=[
                    ("vektor", "Vektor"),
                    ("raster", "Raster"),
                    ("image", "Image"),
                    ("video", "Video"),
                ],
                max_length=10,
            ),
        ),
    ]
