import cadquery as cq

result = (
    cq.Workplane(origin=(20, 0, 0))
    .circle(2)
    .revolve(180, (-20, 0, 0), (-20, -1, 0))
    .center(-20, 0)
    .workplane()
    .rect(20, 4)
    .extrude("next")
)

show_object(result)
