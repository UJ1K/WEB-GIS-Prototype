from django.db import migrations


CREATE_BUCKETS = """
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('Geospatial', 'Geospatial', TRUE),
    ('File-Data', 'File-Data', TRUE)
ON CONFLICT (id) DO NOTHING;
"""

CREATE_POLICIES = """
CREATE POLICY "webgis_public_read_separated_buckets"
ON storage.objects FOR SELECT TO public
USING (bucket_id IN ('Geospatial', 'File-Data'));

CREATE POLICY "webgis_authenticated_upload_separated_buckets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('Geospatial', 'File-Data'));
"""

DROP_POLICIES = """
DROP POLICY IF EXISTS "webgis_authenticated_upload_separated_buckets" ON storage.objects;
DROP POLICY IF EXISTS "webgis_public_read_separated_buckets" ON storage.objects;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("maps", "0004_geodataset_storage_bucket"),
    ]

    operations = [
        migrations.RunSQL(CREATE_BUCKETS, reverse_sql=migrations.RunSQL.noop),
        migrations.RunSQL(CREATE_POLICIES, reverse_sql=DROP_POLICIES),
    ]
