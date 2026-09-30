from django.urls import path

from . import views

app_name = "maps"

urlpatterns = [
    path("", views.map_view, name="map"),
    path("data-manager/", views.data_manager, name="data-manager"),
    path("api/datasets/", views.datasets_api, name="datasets-api"),
    path("api/datasets/<uuid:dataset_id>/raster-url/", views.dataset_raster_url, name="dataset-raster-url"),
    path("api/features/", views.feature_collection, name="feature-collection"),
    path("api/gis/analyze-water/", views.analyze_water, name="analyze-water"),
]
