from django.contrib.gis.db import models


class MapFeature(models.Model):
    """A point, line, or polygon feature stored in WGS84."""

    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    geometry = models.GeometryField(srid=4326, spatial_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
