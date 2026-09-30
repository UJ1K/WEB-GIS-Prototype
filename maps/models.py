import uuid

from django.contrib.gis.db import models


class GeoDataset(models.Model):
    VECTOR = "vektor"
    RASTER = "raster"
    DATA_TYPES = ((VECTOR, "Vektor"), (RASTER, "Raster"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    data_type = models.CharField(max_length=10, choices=DATA_TYPES)
    file_url = models.URLField(blank=True)
    storage_path = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.name


class MapFeature(models.Model):
    """A point, line, or polygon feature stored in WGS84."""

    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    geometry = models.GeometryField(srid=4326, spatial_index=True)
    dataset = models.ForeignKey(GeoDataset, null=True, blank=True, related_name="features", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
