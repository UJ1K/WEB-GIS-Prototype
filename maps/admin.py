from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import MapFeature


@admin.register(MapFeature)
class MapFeatureAdmin(GISModelAdmin):
    list_display = ("name", "created_at", "updated_at")
    search_fields = ("name", "description")
