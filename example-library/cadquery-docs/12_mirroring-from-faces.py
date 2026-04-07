import cadquery as cq

result = cq.Workplane("XY").line(0, 1).line(1, 0).line(0, -0.5).close().extrude(1)

result = result.mirror(result.faces(">X"), union=True)

show_object(result)
