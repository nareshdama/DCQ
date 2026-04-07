import cadquery as cq

result = cq.Workplane("front").box(2, 2, 2).faces("+Z or -X or +X").shell(0.1)

show_object(result)
