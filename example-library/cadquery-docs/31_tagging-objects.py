import cadquery as cq

result = (
    cq.Workplane("XY")
    # create and tag the base workplane
    .box(10, 10, 10)
    .faces(">Z")
    .workplane()
    .tag("baseplane")
    # extrude a cylinder
    .center(-3, 0)
    .circle(1)
    .extrude(3)
    # to reselect the base workplane, simply
    .workplaneFromTagged("baseplane")
    # extrude a second cylinder
    .center(3, 0)
    .circle(1)
    .extrude(2)
)

show_object(result)
