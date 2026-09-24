from django.urls import path

from . import views

app_name = "maps"

urlpatterns = [
    path("", views.map_view, name="map"),
    path("api/features/", views.feature_collection, name="feature-collection"),
    path("api/gis/analyze-water/", views.analyze_water, name="analyze-water"),
]
