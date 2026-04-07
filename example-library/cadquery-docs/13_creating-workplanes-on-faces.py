import cadquery as cq

result = cq.Workplane("front").box(2, 3, 0.5)  # make a basic prism
result = (
    result.faces(">Z").workplane().hole(0.5)
)  # find the top-most face and make a hole

show_object(result)
