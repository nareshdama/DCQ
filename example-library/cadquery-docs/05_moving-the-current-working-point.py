import cadquery as cq

result = cq.Workplane("front").circle(
    3.0
)  # current point is the center of the circle, at (0, 0)
result = result.center(1.5, 0.0).rect(0.5, 0.5)  # new work center is (1.5, 0.0)

result = result.center(-1.5, 1.5).circle(0.25)  # new work center is (0.0, 1.5).
# The new center is specified relative to the previous center, not global coordinates!

result = result.extrude(0.25)

show_object(result)
