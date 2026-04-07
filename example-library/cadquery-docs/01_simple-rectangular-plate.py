import cadquery as cq

result = cq.Workplane("front").box(2.0, 2.0, 0.5)

show_object(result)
