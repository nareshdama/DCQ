import cadquery as cq

result = cq.Workplane("front").box(2, 2, 2).shell(0.1)

show_object(result)
