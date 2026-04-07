import cadquery as cq

result = cq.Workplane("front").circle(2.0).rect(0.5, 0.75).extrude(0.5)

show_object(result)
